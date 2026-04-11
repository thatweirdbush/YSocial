using Microservice.BuildingBlocks.Domain.Repositories;

namespace YSocial.Domain.Comments;

public interface ICommentRepository : IRepository<Comment, CommentId>
{

}
